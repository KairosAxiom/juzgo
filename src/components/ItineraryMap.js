import React, { useEffect, useRef, useState } from 'react';
import styles from './ItineraryMap.module.css';

// Day colour palette — Day 1 red, Day 2 green, Day 3 blue, etc.
const DAY_COLORS = ['#E5484D', '#1E8E5E', '#2A6FDB', '#F0A500', '#8A4FD1', '#00A8A8', '#D6477A', '#5B6B62'];

export default function ItineraryMap({ places, days }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const [activeDay, setActiveDay] = useState('all');
  const [leafletReady, setLeafletReady] = useState(false);

  // Load Leaflet from CDN once
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletReady(true);
    document.body.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstance.current) return;
    const L = window.L;

    const validPlaces = places.filter((p) => p.lat && p.lng);
    const center = validPlaces.length
      ? [validPlaces[0].lat, validPlaces[0].lng]
      : [1.3521, 103.8198]; // fallback: Singapore

    mapInstance.current = L.map(mapRef.current, {
      scrollWheelZoom: false,
    }).setView(center, 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [leafletReady]);

  // Render markers whenever places or activeDay changes
  useEffect(() => {
    if (!leafletReady || !mapInstance.current) return;
    const L = window.L;
    const map = mapInstance.current;

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    const filtered = activeDay === 'all'
      ? places.filter((p) => p.lat && p.lng)
      : places.filter((p) => p.lat && p.lng && String(p.day) === String(activeDay));

    if (filtered.length === 0) return;

    const bounds = [];
    filtered.forEach((place) => {
      const color = DAY_COLORS[((place.day || 1) - 1) % DAY_COLORS.length];
      const icon = L.divIcon({
        className: styles.customMarker,
        html: `<div style="background:${color}" class="${styles.markerPin}"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      });
      const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
      marker.bindPopup(`<strong>${place.name}</strong><br/>Day ${place.day || '–'} · ${place.type || ''}`);
      markersRef.current.push(marker);
      bounds.push([place.lat, place.lng]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [leafletReady, places, activeDay]);

  return (
    <div className={styles.wrap}>
      {/* Day filter tabs */}
      <div className={styles.dayTabs}>
        <button
          className={`${styles.dayTab} ${activeDay === 'all' ? styles.dayTabActive : ''}`}
          onClick={() => setActiveDay('all')}
        >
          All days
        </button>
        {days.map((day, i) => (
          <button
            key={day}
            className={`${styles.dayTab} ${activeDay === day ? styles.dayTabActive : ''}`}
            onClick={() => setActiveDay(day)}
            style={activeDay === day ? { background: DAY_COLORS[(day - 1) % DAY_COLORS.length] } : {}}
          >
            <span
              className={styles.dayDot}
              style={{ background: DAY_COLORS[(day - 1) % DAY_COLORS.length] }}
            />
            Day {day}
          </button>
        ))}
      </div>

      <div ref={mapRef} className={styles.mapBox}>
        {!leafletReady && (
          <div className={styles.mapLoading}>
            <div className={styles.spinner} />
          </div>
        )}
      </div>
    </div>
  );
}
